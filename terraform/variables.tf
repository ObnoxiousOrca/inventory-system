variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Prefix used for resource names."
  type        = string
  default     = "inventory"
}

variable "alert_email" {
  description = "Email that receives low-stock alerts. Confirm the SNS subscription after deployment."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository allowed to deploy, as owner/name without a .git suffix."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repo)) && !endswith(var.github_repo, ".git")
    error_message = "github_repo must be in owner/name format without a .git suffix."
  }
}

variable "create_github_oidc_provider" {
  description = "Set to false if your AWS account already has the GitHub OIDC provider."
  type        = bool
  default     = true
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro may be eligible for applicable Free Tier benefits."
  type        = string
  default     = "t3.micro"
}

variable "ami_id" {
  description = "Optional AMI override. Leave empty to select the latest Amazon Linux 2023 AMI."
  type        = string
  default     = ""
}

variable "ami_architecture" {
  description = "Architecture used to look up the Amazon Linux 2023 AMI when ami_id is empty."
  type        = string
  default     = "x86_64"

  validation {
    condition     = contains(["x86_64", "arm64"], var.ami_architecture)
    error_message = "ami_architecture must be x86_64 or arm64."
  }
}

variable "root_volume_size" {
  description = "Encrypted gp3 root volume size in GiB."
  type        = number
  default     = 12

  validation {
    condition     = var.root_volume_size >= 8 && var.root_volume_size <= 100
    error_message = "root_volume_size must be between 8 and 100 GiB."
  }
}

variable "admin_cidr" {
  description = "Optional CIDR allowed to SSH to the instance. Leave empty and use SSM Session Manager by default."
  type        = string
  default     = ""

  validation {
    condition = (var.admin_cidr == "" && var.ssh_key_name == "") || (
      var.admin_cidr != "" && var.ssh_key_name != "" && can(cidrhost(var.admin_cidr, 0))
    )
    error_message = "Set both admin_cidr and ssh_key_name for optional SSH access, or leave both empty and use SSM."
  }
}

variable "ssh_key_name" {
  description = "Optional existing EC2 key pair name. Set together with admin_cidr only when SSH access is required."
  type        = string
  default     = ""
}

variable "cloudwatch_log_retention_days" {
  description = "Retention period for backend CloudWatch logs."
  type        = number
  default     = 14

  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545,
      731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
    ], var.cloudwatch_log_retention_days)
    error_message = "cloudwatch_log_retention_days must be a supported CloudWatch Logs retention period."
  }
}
