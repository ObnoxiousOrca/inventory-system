output "ec2_instance_id" {
  description = "Backend EC2 instance ID; use this for SSM and status checks."
  value       = aws_instance.backend.id
}

output "ec2_public_dns" {
  description = "Public DNS name used by the frontend to call the backend API."
  value       = aws_instance.backend.public_dns
}

output "ec2_public_ip" {
  description = "Public IPv4 address of the backend instance."
  value       = aws_instance.backend.public_ip
}

output "ecr_repository_name" {
  value = aws_ecr_repository.backend.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.products.name
}

output "sns_topic_arn" {
  value = aws_sns_topic.low_stock.arn
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "frontend_url" {
  description = "HTTP URL for the public S3 static website."
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
}

output "github_actions_role_arn" {
  description = "Save as the GitHub repository secret AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_actions.arn
}
