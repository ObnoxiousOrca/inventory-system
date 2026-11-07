output "api_url" {
  description = "Backend base URL (set as VITE_API_URL for the frontend; use https:// once a certificate is configured)."
  value       = "http://${aws_lb.api.dns_name}"
}

output "frontend_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "frontend_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "ecr_repository_name" {
  value = aws_ecr_repository.backend.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "ecs_task_family" {
  value = aws_ecs_task_definition.backend.family
}

output "sns_topic_arn" {
  value = aws_sns_topic.low_stock.arn
}

output "github_actions_role_arn" {
  description = "Save as the GitHub repository secret AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_actions.arn
}
