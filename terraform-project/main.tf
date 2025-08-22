# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

provider "aws" {}

resource "aws_sqs_queue" "example_queue" {
  name_prefix                = "TerraformExampleQueue"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.queue_visibility_timeout
}
