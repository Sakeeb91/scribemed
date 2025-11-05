###############################################################################
# HIPAA-Compliant AWS Infrastructure
# -----------------------------------------------------------------------------
# This Terraform configuration provisions the core production infrastructure
# required for the Scribemed platform, aligning with issue #3 acceptance criteria.
# Each major block includes comments documenting HIPAA-focused controls to ease
# security and compliance reviews.
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    bucket         = "ai-med-docs-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "AI-Medical-Documentation"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Compliance  = "HIPAA"
      CostCenter  = "Engineering"
    }
  }
}

# Data sources used for account context and multi-AZ deployments.
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

# -----------------------------------------------------------------------------
# Networking: VPC with public/private/database subnets across three AZs and
# network controls required for HIPAA auditability.
# -----------------------------------------------------------------------------
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  name = "ai-med-docs-${var.environment}"
  cidr = var.vpc_cidr

  azs              = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets  = var.private_subnet_cidrs
  public_subnets   = var.public_subnet_cidrs
  database_subnets = var.database_subnet_cidrs

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment == "dev"
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPC Flow Logs deliver network visibility for HIPAA audit requirements.
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true
  flow_log_retention_in_days           = 2555 # 7 years retention aligns with HIPAA expectations.

  # Dedicated network ACLs provide an additional guardrail layer.
  manage_default_network_acl    = true
  public_dedicated_network_acl  = true
  private_dedicated_network_acl = true

  tags = {
    Name = "ai-med-docs-vpc-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Encryption: Central KMS key and alias used across services for PHI protection.
# -----------------------------------------------------------------------------
resource "aws_kms_key" "main" {
  description             = "KMS key for AI Med Docs ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Enable IAM User Permissions"
        Effect   = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid      = "Allow CloudWatch Logs"
        Effect   = "Allow"
        Principal = {
          Service = "logs.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "ai-med-docs-kms-${var.environment}"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/ai-med-docs-${var.environment}"
  target_key_id = aws_kms_key.main.key_id
}

# -----------------------------------------------------------------------------
# Logging bucket receives all access logs, keeping PHI workloads segregated.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "logs" {
  bucket = "ai-med-docs-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"

  force_destroy = var.environment != "production"

  tags = {
    Name      = "central-logs"
    DataClass = "LogArchive"
  }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Primary S3 bucket for PHI audio with encryption, lifecycle, and logging.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "audio_storage" {
  bucket = "ai-med-docs-audio-${var.environment}-${data.aws_caller_identity.current.account_id}"

  force_destroy = var.environment != "production"

  tags = {
    Name      = "audio-storage"
    PHI       = "true"
    DataClass = "Confidential"
  }
}

resource "aws_s3_bucket_versioning" "audio_storage" {
  bucket = aws_s3_bucket.audio_storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio_storage" {
  bucket = aws_s3_bucket.audio_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "audio_storage" {
  bucket = aws_s3_bucket.audio_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "audio_storage" {
  bucket = aws_s3_bucket.audio_storage.id

  rule {
    id     = "delete-old-audio"
    status = "Enabled"

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_s3_bucket_logging" "audio_storage" {
  bucket = aws_s3_bucket.audio_storage.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "audio-storage-access-logs/"
}

# -----------------------------------------------------------------------------
# Application security group acts as the ingress source for database traffic.
# Attach this SG to compute workloads needing database access.
# -----------------------------------------------------------------------------
resource "aws_security_group" "application" {
  name_prefix = "ai-med-docs-app-${var.environment}"
  description = "Security group for application workloads accessing protected services"
  vpc_id      = module.vpc.vpc_id

  egress {
    description = "Allow outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "application-sg"
  }
}

# -----------------------------------------------------------------------------
# Database tier: encrypted PostgreSQL with automated backups and secret storage.
# -----------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "ai-med-docs-${var.environment}"
  subnet_ids = module.vpc.database_subnets

  tags = {
    Name = "ai-med-docs-db-subnet-group"
  }
}

resource "aws_security_group" "database" {
  name_prefix = "ai-med-docs-db-${var.environment}"
  description = "Restricts PostgreSQL access to application security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from application workloads"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.application.id]
  }

  egress {
    description = "Allow outbound responses"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "database-sg"
  }
}

resource "random_password" "db_master_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_master_password" {
  name                    = "ai-med-docs/db-master-password-${var.environment}"
  description             = "Master password for RDS PostgreSQL"
  kms_key_id              = aws_kms_key.main.id
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id     = aws_secretsmanager_secret.db_master_password.id
  secret_string = random_password.db_master_password.result
}

resource "aws_db_instance" "primary" {
  identifier = "ai-med-docs-${var.environment}"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.db_instance_class

  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  db_name  = "aimedocs"
  username = "aimedocs_admin"
  password = random_password.db_master_password.result

  vpc_security_group_ids = [aws_security_group.database.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  publicly_accessible    = false

  backup_retention_period = 35
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  copy_tags_to_snapshot = true
  skip_final_snapshot   = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "ai-med-docs-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.main.arn
  performance_insights_retention_period = 7

  multi_az            = var.environment == "production"
  deletion_protection = var.environment == "production"

  tags = {
    Name = "ai-med-docs-db-${var.environment}"
    PHI  = "true"
  }
}

# -----------------------------------------------------------------------------
# Elastic Kubernetes Service cluster for application workloads with encryption.
# -----------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.16.0"

  cluster_name    = "ai-med-docs-${var.environment}"
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.main.arn
    resources        = ["secrets"]
  }

  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  enable_irsa = true

  eks_managed_node_groups = {
    general = {
      name = "general-${var.environment}"

      instance_types = ["t3.large"]
      capacity_type  = "ON_DEMAND"

      min_size     = 2
      max_size     = 10
      desired_size = 3

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 100
            volume_type           = "gp3"
            encrypted             = true
            kms_key_id            = aws_kms_key.main.arn
            delete_on_termination = true
          }
        }
      }

      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }

      additional_security_group_ids = [aws_security_group.application.id]

      tags = {
        Environment = var.environment
        NodeGroup   = "general"
      }
    }
  }

  cluster_security_group_additional_rules = {
    ingress_nodes_ephemeral_ports_tcp = {
      description                = "Nodes on ephemeral ports"
      protocol                   = "tcp"
      from_port                  = 1025
      to_port                    = 65535
      type                       = "ingress"
      source_node_security_group = true
    }
  }

  tags = {
    Name = "ai-med-docs-eks-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# CloudTrail captures API activity with encryption and S3/CW delivery.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "cloudtrail" {
  bucket = "ai-med-docs-cloudtrail-${var.environment}-${data.aws_caller_identity.current.account_id}"

  force_destroy = var.environment != "production"

  tags = {
    Name = "cloudtrail-logs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid     = "AWSCloudTrailAclCheck"
        Effect  = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid     = "AWSCloudTrailWrite"
        Effect  = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/ai-med-docs-${var.environment}"
  retention_in_days = 2555
  kms_key_id        = aws_kms_key.main.arn

  tags = {
    Name = "cloudtrail-logs"
  }
}

resource "aws_iam_role" "cloudtrail" {
  name = "ai-med-docs-cloudtrail-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "cloudtrail" {
  name = "ai-med-docs-cloudtrail-policy-${var.environment}"
  role = aws_iam_role.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
      }
    ]
  })
}

resource "aws_cloudtrail" "main" {
  name                          = "ai-med-docs-trail-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn
  cloud_watch_logs_group_arn    = aws_cloudwatch_log_group.cloudtrail.arn
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.audio_storage.arn}/"]
    }
  }

  insight_selector {
    insight_type = "ApiCallRateInsight"
  }

  tags = {
    Name = "ai-med-docs-cloudtrail-${var.environment}"
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# -----------------------------------------------------------------------------
# WAF Web ACL enforcing managed rule sets plus rate limiting and geo controls.
# -----------------------------------------------------------------------------
resource "aws_wafv2_web_acl" "main" {
  name  = "ai-med-docs-waf-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitRule"
    priority = 4

    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate_limit_response"
        }
      }
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRuleMetric"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = length(var.blocked_countries) > 0 ? [1] : []

    content {
      name     = "GeoBlockingRule"
      priority = 5

      action {
        block {}
      }

      statement {
        geo_match_statement {
          country_codes = var.blocked_countries
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "GeoBlockingRuleMetric"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "ai-med-docs-waf-${var.environment}"
    sampled_requests_enabled   = true
  }

  custom_response_body {
    key          = "rate_limit_response"
    content      = "Too many requests. Please try again later."
    content_type = "TEXT_PLAIN"
  }

  tags = {
    Name = "ai-med-docs-waf-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch log groups and security alerting pipeline.
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/application/ai-med-docs-${var.environment}"
  retention_in_days = 2555 # 7 years
  kms_key_id        = aws_kms_key.main.arn

  tags = {
    Name = "application-logs"
  }
}

resource "aws_sns_topic" "security_alerts" {
  name              = "ai-med-docs-security-alerts-${var.environment}"
  kms_master_key_id = aws_kms_key.main.id

  tags = {
    Name = "security-alerts"
  }
}

resource "aws_sns_topic_subscription" "security_alerts_email" {
  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.security_alert_email
}

# Metric filters convert CloudTrail log patterns into CloudWatch metrics for alarms.
resource "aws_cloudwatch_log_metric_filter" "unauthorized_api_calls" {
  name           = "unauthorized-api-calls-${var.environment}"
  pattern        = "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  metric_transformation {
    name      = "UnauthorizedAPICalls"
    namespace = "CloudTrailMetrics"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "root_account_usage" {
  name           = "root-account-usage-${var.environment}"
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  metric_transformation {
    name      = "RootAccountUsage"
    namespace = "CloudTrailMetrics"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_api_calls" {
  alarm_name          = "unauthorized-api-calls-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnauthorizedAPICalls"
  namespace           = "CloudTrailMetrics"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Triggers when unauthorized API calls exceed threshold"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
  treat_missing_data  = "notBreaching"

  depends_on = [aws_cloudwatch_log_metric_filter.unauthorized_api_calls]
}

resource "aws_cloudwatch_metric_alarm" "root_account_usage" {
  alarm_name          = "root-account-usage-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountUsage"
  namespace           = "CloudTrailMetrics"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Triggers on any root account usage"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
  treat_missing_data  = "notBreaching"

  depends_on = [aws_cloudwatch_log_metric_filter.root_account_usage]
}

resource "aws_cloudwatch_metric_alarm" "db_cpu_utilization" {
  alarm_name          = "db-cpu-utilization-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Database CPU utilization is high"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }
}
