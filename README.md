# Cloud-Based Inventory Management System

Inventory management system with a React/Vite frontend and a Node.js/Express backend, backed by DynamoDB and SNS. Terraform provisions a single EC2 backend, S3 website hosting, ECR, CloudWatch, and GitHub OIDC deployment.

## Layout

```
backend/              Express API (src/, tests/, scripts/)
docker/               Dockerfile + local Compose stack, plus EC2 Compose/Nginx/cloud-init files
terraform/            AWS infrastructure (EC2, ECR, DynamoDB, SNS, CloudWatch, S3 website, GitHub OIDC role)
.github/workflows/    CI/CD pipeline
frontend/             React + Vite inventory dashboard
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check (EC2 Nginx / Docker) |
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

The frontend is hosted by the public S3 website endpoint over HTTP. The React app calls the EC2 Nginx API over HTTP using `VITE_API_URL`; the backend CORS origin is set to the exact S3 website origin. Port 80 on EC2 and frontend object reads are public. The backend container remains private to the Docker network. Use SSM Session Manager for administration and deployments; SSH is not required.

1. **Install tools and prepare GitHub.** Install AWS CLI v2, Terraform 1.5+, Docker, and `jq`. Create an empty GitHub repository and prepare the local `main` branch; wait to push it until workflow settings are configured. Confirm the AWS account has a default VPC with a public subnet in the deployment region.
2. **Configure credentials.** Use an IAM Identity Center user assigned an appropriate permission set; do not use root credentials. For example:

   ```bash
   aws configure sso --profile inventory-admin
   aws sso login --profile inventory-admin
   export AWS_PROFILE=inventory-admin
   aws sts get-caller-identity
   ```

   Verify the identity is the intended deployment role and not root.
3. **Configure Terraform.** Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`. Set a real `alert_email`, `github_repo` as `owner/repository` (without `.git`), and the region. The defaults use a `t3.micro`, latest Amazon Linux 2023 AMI, and encrypted 12 GiB gp3 root volume. Free Tier eligibility depends on your account. Leave `admin_cidr` and `ssh_key_name` empty to use SSM instead of SSH. Set both only if optional SSH access is required. Set `create_github_oidc_provider = false` if the account already has the GitHub OIDC provider.
4. **Initialize, review, and create the infrastructure.**

   ```bash
   terraform -chdir=terraform init
   terraform -chdir=terraform plan
   terraform -chdir=terraform apply
   ```

   Review the plan before approving. The current state contains the CloudFront API cache policy and S3 origin access control, which Terraform will destroy; no CloudFront distribution is tracked in this state. The S3 bucket should remain but its public-access settings and policy will change, with website hosting added. EC2, DynamoDB, ECR, SNS, CloudWatch resources, and GitHub OIDC provider/role should be retained, not replaced. If Terraform proposes replacing or destroying the EC2 instance, DynamoDB table, ECR repository, SNS topic, or S3 bucket, stop and inspect the plan before applying. Confirm the SNS email subscription.
5. **Seed ECR and deploy the first backend image.** From the repository root:

   ```bash
   AWS_REGION=ap-south-1 # change to the region in terraform.tfvars
   ECR_URI=$(terraform -chdir=terraform output -raw ecr_repository_url)
   REGISTRY_HOST=${ECR_URI%%/*}
   INSTANCE_ID=$(terraform -chdir=terraform output -raw ec2_instance_id)
   aws ecr get-login-password --region "$AWS_REGION" |
     docker login --username AWS --password-stdin "$REGISTRY_HOST"
   docker build -f docker/Dockerfile -t "$ECR_URI:bootstrap" ./backend
   docker push "$ECR_URI:bootstrap"
   ```

   This local bootstrap build uses your machine's Docker architecture. If deploying to an ARM instance, build and push a matching image instead (for example, `docker buildx build --platform linux/arm64 --push -f docker/Dockerfile -t "$ECR_URI:bootstrap" ./backend`). Subsequent GitHub Actions images support both AMD64 and ARM64.

   User data installs Docker, the Compose plugin, and SSM, then starts Nginx. Wait until the instance is online in Systems Manager:

   ```bash
   aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" \
     --include-all-instances --query 'InstanceStatuses[0].InstanceState.Name' --output text
   aws ssm describe-instance-information \
     --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
     --query 'InstanceInformationList[0].PingStatus' --output text
   ```

   Get the S3 website origin for CORS:

   ```bash
   FRONTEND_ORIGIN=$(terraform -chdir=terraform output -raw frontend_url)
   echo "$FRONTEND_ORIGIN"
   ```

   Deploy the bootstrap image through SSM (the EC2 instance role authenticates to ECR):

   ```bash
   PARAMETERS=$(jq -cn \
     --arg region "$AWS_REGION" \
     --arg registry "$REGISTRY_HOST" \
     --arg origin "$FRONTEND_ORIGIN" \
     '{
       commands: [
         "set -euo pipefail",
         "sudo mkdir -p /opt/inventory",
         "sudo chown \"$(whoami)\" /opt/inventory",
         "cd /opt/inventory",
         "aws ecr get-login-password --region " + $region + " | docker login --username AWS --password-stdin " + $registry,
         "sed -i '\''s/^IMAGE_TAG=.*/IMAGE_TAG=bootstrap/'\'' .env",
         "sed -i '\''/^CORS_ORIGINS=/d'\'' backend.env && printf '\\''\\nCORS_ORIGINS=%s\\n'\\'' " + ($origin | @sh) + " >> backend.env",
         "docker compose --profile backend pull backend",
         "docker compose --profile backend up -d backend nginx",
         "for attempt in $(seq 1 30); do if curl --fail --silent http://127.0.0.1/health; then exit 0; fi; sleep 2; done; docker compose logs --tail=100 backend; exit 1"
       ]
     }')
   COMMAND_ID=$(aws ssm send-command --instance-ids "$INSTANCE_ID" \
     --document-name AWS-RunShellScript --parameters "$PARAMETERS" \
     --query 'Command.CommandId' --output text)
   echo "SSM command: $COMMAND_ID"
   ```

   Wait for the command to finish with status `Success` and inspect its output:

   ```bash
   aws ssm get-command-invocation --command-id "$COMMAND_ID" \
     --instance-id "$INSTANCE_ID" \
     --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}'
   ```

6. **Configure GitHub OIDC and workflow settings.** The Terraform role trusts only the configured repository's `main` branch. Set `AWS_REGION`, `ECR_REPOSITORY`, `EC2_INSTANCE_ID`, `BACKEND_API_URL` (`http://` plus the EC2 public DNS), `FRONTEND_ORIGIN` (the `frontend_url` output), and `FRONTEND_BUCKET` in `.github/workflows/ci-cd.yml`. In GitHub **Settings → Secrets and variables → Actions → Secrets**, add `AWS_DEPLOY_ROLE_ARN` using:

   ```bash
   terraform -chdir=terraform output -raw github_actions_role_arn
   ```

   No AWS access keys are needed in GitHub. The workflow sets `VITE_API_URL` to `BACKEND_API_URL` when building the frontend and updates backend CORS using `FRONTEND_ORIGIN`.
7. **Deploy application updates.** Push to `main`. GitHub Actions installs dependencies, runs backend tests and the frontend build, pushes a backend image tagged with the commit SHA, syncs the frontend build to S3, then deploys the image to EC2 using SSM. The workflow waits for SSM completion and fails unless the remote health check succeeds. Open the `frontend_url` Terraform output.
8. **Test and inspect the deployment.**

   ```bash
   FRONTEND_URL=$(terraform -chdir=terraform output -raw frontend_url)
   BACKEND_API_URL="http://$(terraform -chdir=terraform output -raw ec2_public_dns)"
   curl --fail "$FRONTEND_URL"
   curl --fail "$BACKEND_API_URL/health"
   curl --fail "$BACKEND_API_URL/api/dashboard"
   curl --fail "$BACKEND_API_URL/api/products"
   aws ssm start-session --target "$INSTANCE_ID"
   ```

   In the SSM session, inspect `sudo docker ps`, `cd /opt/inventory && sudo docker compose --profile backend logs --tail=100`, or `/var/log/inventory-bootstrap.log`. Follow backend logs locally:

   ```bash
   aws logs tail "/ecs/inventory-backend" --since 15m --follow
   ```

   The existing CloudWatch log group name is retained to preserve its history.
9. **Clean up.** Run `terraform -chdir=terraform destroy` after the demo. This removes EC2, ECR, and other managed resources; it also deletes the DynamoDB table and inventory data, so export anything you need first. EC2, public IPv4, EBS, CloudWatch, S3 storage/requests, ECR, DynamoDB, and SNS may incur charges. Free Tier benefits are account-dependent; zero cost is not guaranteed. No NAT Gateway, Elastic IP, or CDN is provisioned.

## Placeholders to replace (search for `REPLACE`)

- `backend/.env.example`: region, `SNS_TOPIC_ARN`, `CORS_ORIGINS` (used for local development)
- `terraform/terraform.tfvars`: `alert_email`, `github_repo`, optional `instance_type`, `ami_id`, `root_volume_size`, `admin_cidr`, `ssh_key_name`
- `.github/workflows/ci-cd.yml`: region, `ECR_REPOSITORY`, `EC2_INSTANCE_ID`, `BACKEND_API_URL`, `FRONTEND_ORIGIN`, `FRONTEND_BUCKET`, `AWS_DEPLOY_ROLE_ARN` secret
- `terraform/main.tf`: optional remote state backend block
