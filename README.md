# Cloud-Based Inventory Management System

Inventory management system with a React/Vite frontend and a Node.js/Express backend, backed by DynamoDB and SNS, with Docker, ECS/Fargate, Terraform, and GitHub Actions.

## Layout

```
backend/              Express API (src/, tests/, scripts/)
docker/               Dockerfile + docker-compose.yml (local stack with DynamoDB Local)
terraform/            AWS infrastructure (ECR, ECS/Fargate, ALB, DynamoDB, SNS, CloudWatch, S3/CloudFront, GitHub OIDC role)
.github/workflows/    CI/CD pipeline
frontend/             React + Vite inventory dashboard
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check (ALB / Docker) |
| GET | `/api/products?category=&lowStockOnly=true` | List products |
| POST | `/api/products` | Create product |
| GET / PUT / DELETE | `/api/products/:id` | Read / update details / delete (`:id` = SKU) |
| POST | `/api/products/:id/stock` | `{ "operation": "increase"\|"reduce", "amount": 5 }` |
| GET | `/api/dashboard` | Totals, low-stock count, stock by category, recent updates |

Low-stock rule: `quantity <= lowStockThreshold`. When a product crosses into low stock, one SNS email is sent; the `lowStockAlertSent` flag (set atomically in DynamoDB) prevents repeats and resets when the product is restocked above the threshold.

## Run locally

```bash
cd backend && npm install          # also generates package-lock.json (commit it; CI uses `npm ci`)
npm test
cd ../docker && docker compose up --build
curl localhost:3000/health
curl -X POST localhost:3000/api/products -H 'content-type: application/json' \
  -d '{"productId":"SKU-1","name":"Widget","category":"Parts","quantity":10,"lowStockThreshold":5,"price":9.5}'
curl -X POST localhost:3000/api/products/SKU-1/stock -H 'content-type: application/json' \
  -d '{"operation":"reduce","amount":6}'
```

Locally `SNS_TOPIC_ARN` is empty, so the alert is written to the logs instead of emailed.

In a second terminal, start the frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`). Set `VITE_API_URL` in `frontend/.env` if the backend is running at a different URL. The frontend reads products and dashboard data from the backend API; it does not use mock product data.

## Deploy to AWS

The frontend is served by CloudFront, which also proxies `/api/*` to the load balancer. This keeps browser API requests on the same HTTPS origin and avoids needing a custom domain or an API certificate.

1. Install and configure the AWS CLI and Terraform, and create an empty GitHub repository. Do not push this project's `main` branch yet; that push starts the deployment workflow, which needs the AWS resources and GitHub settings from the following steps. In the AWS console, confirm the account has a default VPC in the deployment region.
2. Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`. Set `aws_region`, your alert email, and `github_repo` (`owner/repository`). If your AWS account already has a GitHub Actions OIDC provider, set `create_github_oidc_provider = false`. Keep `desired_count = 0` for the first apply so ECS does not try to start before the first image is published.
3. Run `cd terraform && terraform init && terraform plan && terraform apply`. Review the plan and confirm it in AWS. Confirm the SNS subscription email when it arrives. The first apply creates the infrastructure and CloudFront distribution, but keeps the backend task count at zero.
4. Push an initial backend image to the ECR repository Terraform created. From the repository root, set `AWS_REGION` to the region in `terraform.tfvars`, then run:

   ```bash
   AWS_REGION=ap-south-1 # change to the region in terraform.tfvars
   cd terraform
   ECR_URI=$(terraform output -raw ecr_repository_url)
   cd ..
   REGISTRY_HOST=$(printf '%s' "$ECR_URI" | cut -d/ -f1)
   aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY_HOST"
   docker build -f docker/Dockerfile -t "$ECR_URI:latest" ./backend
   docker push "$ECR_URI:latest"
   ```
5. In the GitHub repository, add the Actions secret `AWS_DEPLOY_ROLE_ARN` using `terraform output -raw github_actions_role_arn`. Update the region and the ECR, ECS, frontend bucket, and CloudFront distribution ID values in `.github/workflows/ci-cd.yml` to match `terraform output` values. Leave `VITE_API_URL` unset; the frontend uses same-origin `/api` requests.
6. In `terraform/terraform.tfvars`, set `cors_origins` to the `frontend_url` output (for example, `https://d123example.cloudfront.net`) and set `desired_count = 1`. Run `terraform plan && terraform apply` to start the backend using the initial image.
7. Push the project to `main`. GitHub Actions will test the backend, build and push the API image, deploy it to ECS, then build and upload the frontend. Check the Actions run, then open `terraform output -raw frontend_url`.
8. When you're finished, set `desired_count = 0` and run `terraform apply` to stop Fargate tasks. Use `terraform destroy` to remove the demo infrastructure entirely. The load balancer and other resources can incur charges even when the task count is zero.

## Placeholders to replace (search for `REPLACE`)

- `backend/.env.example`: region, `SNS_TOPIC_ARN`, `CORS_ORIGINS`
- `terraform/variables.tf` / `terraform.tfvars`: `alert_email`, `github_repo`, optional `acm_certificate_arn`, `cors_origins`
- `.github/workflows/ci-cd.yml`: region, resource names, `FRONTEND_BUCKET`, `AWS_DEPLOY_ROLE_ARN` secret
- `terraform/main.tf`: optional remote state backend block
