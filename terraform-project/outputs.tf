# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

output "QueueArn" {
  description = "ARN of the created example SQS queue resource"
  value       = aws_sqs_queue.example_queue.arn
}
