terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # OPTIONAL: remote state. Create the bucket/table first, then uncomment and REPLACE the names.
  # backend "s3" {
  #   bucket         = "REPLACE-terraform-state-bucket"
  #   key            = "inventory/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "REPLACE-terraform-lock-table"
  # }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = var.project, ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}

# Networking: uses a public subnet in the account's default VPC; no NAT Gateway is needed.
# The instance has outbound internet access for ECR, SSM, package installs, and CloudWatch.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  name = var.project
}

# ---------------------------------------------------------------- Container registry
resource "aws_ecr_repository" "backend" {
  name                 = "${local.name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # lets `terraform destroy` remove it even with images (lab convenience)
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 10 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------- Database
resource "aws_dynamodb_table" "products" {
  name         = "${local.name}-products"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "productId"

  attribute {
    name = "productId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ---------------------------------------------------------------- Low-stock notifications
resource "aws_sns_topic" "low_stock" {
  name = "${local.name}-low-stock-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.low_stock.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---------------------------------------------------------------- Logging
resource "aws_cloudwatch_log_group" "backend" {
  # Retain this legacy name so a migration does not replace the existing log group/history.
  name              = "/ecs/${local.name}-backend"
  retention_in_days = var.cloudwatch_log_retention_days
}

# ---------------------------------------------------------------- IAM for EC2
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend_instance" {
  name               = "${local.name}-backend-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_instance_profile" "backend" {
  name = "${local.name}-backend"
  role = aws_iam_role.backend_instance.name
}

resource "aws_iam_role_policy_attachment" "backend_ssm" {
  role       = aws_iam_role.backend_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "backend_instance" {
  statement {
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Scan", "dynamodb:Query",
    ]
    resources = [aws_dynamodb_table.products.arn]
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.low_stock.arn]
  }
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.backend.arn}:*"]
  }
}

resource "aws_iam_role_policy" "backend_instance" {
  name   = "${local.name}-backend-instance"
  role   = aws_iam_role.backend_instance.id
  policy = data.aws_iam_policy_document.backend_instance.json
}

# ---------------------------------------------------------------- EC2 backend
data "aws_ami" "amazon_linux_2023" {
  count       = var.ami_id == "" ? 1 : 0
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-*-${var.ami_architecture}"]
  }

  filter {
    name   = "architecture"
    values = [var.ami_architecture]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "backend_instance" {
  name        = "${local.name}-backend"
  description = "Allow public API traffic and outbound instance access"
  vpc_id      = data.aws_vpc.default.id

  lifecycle {
    # AWS does not allow an existing security group's description to be modified.
    ignore_changes = [description]
  }

  ingress {
    description = "Public HTTP API traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.admin_cidr == "" ? [] : [var.admin_cidr]
    content {
      description = "Optional SSH access for the configured administrator CIDR"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "backend" {
  ami                         = var.ami_id != "" ? var.ami_id : data.aws_ami.amazon_linux_2023[0].id
  instance_type               = var.instance_type
  key_name                    = var.ssh_key_name != "" ? var.ssh_key_name : null
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.backend_instance.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.backend.name
  user_data = templatefile("${path.module}/../docker/ec2/cloud-init.sh.tftpl", {
    compose_content      = base64encode(file("${path.module}/../docker/ec2/docker-compose.yml"))
    nginx_content        = base64encode(file("${path.module}/../docker/ec2/nginx.conf"))
    ecr_repository_url   = aws_ecr_repository.backend.repository_url
    aws_region           = var.aws_region
    dynamodb_table       = aws_dynamodb_table.products.name
    sns_topic_arn        = aws_sns_topic.low_stock.arn
    cloudwatch_log_group = aws_cloudwatch_log_group.backend.name
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
    encrypted             = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring = false

  tags = {
    Name = "${local.name}-backend"
  }

  depends_on = [
    aws_iam_role_policy.backend_instance,
    aws_iam_role_policy_attachment.backend_ssm,
  ]
}

# ---------------------------------------------------------------- CloudWatch alarm
resource "aws_cloudwatch_metric_alarm" "backend_cpu" {
  alarm_name          = "${local.name}-backend-cpu"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { InstanceId = aws_instance.backend.id }
  alarm_actions       = [aws_sns_topic.low_stock.arn]
}

# ---------------------------------------------------------------- Frontend: S3 + CloudFront
resource "aws_s3_bucket" "frontend" {
  bucket        = "${local.name}-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })

  depends_on = [
    aws_s3_bucket_public_access_block.frontend
  ]
}
# ---------------------------------------------------------------- GitHub Actions -> AWS (OIDC)
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer validates this thumbprint for GitHub, but the argument is still required by older provider versions.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"] # only the main branch may deploy
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${local.name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }
  statement {
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.backend.arn,
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }
  statement {
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
  statement {
    actions   = ["s3:GetBucketLocation", "s3:ListBucket", "s3:PutObject", "s3:DeleteObject"]
    resources = [aws_s3_bucket.frontend.arn, "${aws_s3_bucket.frontend.arn}/*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
