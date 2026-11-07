variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1" # REPLACE if you deploy elsewhere
}

variable "project" {
  description = "Prefix used for resource names."
  type        = string
  default     = "inventory"
}

variable "alert_email" {
  description = "Email that receives low-stock alerts. AWS sends a confirmation mail you must accept."
  type        = string
  default     = "abcd@xyz.com" # REPLACE with the admin's real email
}

variable "github_repo" {
  description = "GitHub repo allowed to deploy, as 'owner/name'."
  type        = string
  default     = "ObnoxiousOrca/Inventory.git" # REPLACE with your GitHub repository
}

variable "create_github_oidc_provider" {
  description = "Set to false if your AWS account already has the GitHub OIDC provider (only one is allowed per account)."
  type        = bool
  default     = true
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "task_cpu" {
  description = "Fargate CPU units. 256 + 512 MB memory is the cheapest valid combination."
  type        = number
  default     = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  description = "Number of running backend containers. Set to 0 when idle to avoid Fargate charges."
  type        = number
  default     = 1
}

variable "acm_certificate_arn" {
  description = "OPTIONAL: ACM certificate ARN in the same region to enable HTTPS on the load balancer. Leave empty for HTTP only (not recommended beyond a demo)."
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Allowed frontend origin(s), comma separated. Update to the CloudFront URL after the first apply."
  type        = string
  default     = "http://localhost:5173" # REPLACE with the CloudFront URL (terraform output frontend_url)
}
