# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

terraform {
  backend "s3" {
    encrypt      = true
    key          = "tfstate/sample_terraform_cfn_wrapper"
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.9.0"
    }
  }

  required_version = "~> 1.10"
}
