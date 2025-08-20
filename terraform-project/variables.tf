# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

variable "queue_visibility_timeout" {
  default     = 300
  description = "Visibility timeout for the created SQS queue in seconds"
  type        = number
}
