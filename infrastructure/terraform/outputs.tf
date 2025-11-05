###############################################################################
# Key infrastructure outputs exposed to downstream modules and operators.
###############################################################################

output "vpc_id" {
  description = "Identifier of the provisioned VPC"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint for the EKS control plane"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "Address of the HIPAA-compliant PostgreSQL instance"
  value       = aws_db_instance.primary.endpoint
  sensitive   = true
}

output "s3_audio_bucket" {
  description = "Primary S3 bucket that stores PHI audio assets"
  value       = aws_s3_bucket.audio_storage.id
}

output "kms_key_id" {
  description = "KMS key used to encrypt all protected workloads"
  value       = aws_kms_key.main.id
}
