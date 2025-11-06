###############################################################################
# Shared variable definitions for HIPAA-compliant infrastructure module.
###############################################################################

variable "aws_region" {
  description = "AWS region where infrastructure should be provisioned"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the primary VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets spanning three availability zones"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets spanning three availability zones"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for isolated database subnets"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "db_instance_class" {
  description = "RDS instance class sized for workload requirements"
  type        = string
  default     = "db.t3.large"
}

variable "blocked_countries" {
  description = "Optional list of ISO country codes for WAF geo blocking"
  type        = list(string)
  default     = []
}

variable "security_alert_email" {
  description = "Email address subscribed to security alert notifications"
  type        = string
}
