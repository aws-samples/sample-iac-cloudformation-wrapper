// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { SqsQueue } from "@cdktf/provider-aws/lib/sqs-queue";
import {
  S3Backend,
  TerraformOutput,
  TerraformStack,
  TerraformVariable,
} from "cdktf";
import { Construct } from "constructs";

export interface ICdktfProjectStackConfig {
  /**
   * (Default) visibility timeout for the created SQS queue in seconds. This stack creates a Terraform
   * variable to manage this setting, so it will be overridable by other methods if needed.
   *
   * @default 300
   */
  readonly defaultQueueVisibilityTimeout?: number;
  /**
   * Provide an existing S3 bucket name to enable remote/shared Terraform state tracking.
   *
   * @default - Terraform will use local file backend (not recommended for shared environments!)
   */
  readonly s3BackendBucket?: string;
  /**
   * Specify what object path+name should be created in the `s3BackendBucket` for Terraform state
   * tracking, if `s3BackendBucket` is provided (ignored otherwise).
   *
   * @default "CdktfProjectStack.tfstate"
   */
  readonly s3BackendKey?: string;
}

/**
 * A basic example CDKTF stack - just creates an SQS queue
 */
export class CdktfProjectStack extends TerraformStack {
  constructor(scope: Construct, id: string, config?: ICdktfProjectStackConfig) {
    super(scope, id);

    new AwsProvider(this, "aws");

    if (config?.s3BackendBucket) {
      new S3Backend(this, {
        bucket: config.s3BackendBucket,
        encrypt: true,
        key: config.s3BackendKey || "CdktfProjectStack.tfstate",
      }).addOverride("use_lockfile", true);
      // Lockfile override per: https://github.com/hashicorp/terraform-cdk/issues/3889
    }

    // Example input (that we expose as a Terraform variable *and* to the bootstrap CFn):
    const queueVisibilityTimeoutSecsVar = new TerraformVariable(
      this,
      "QueueVisibilityTimeout",
      {
        description: "Visibility timeout for the created SQS queue in seconds",
        type: "number",
        default: config?.defaultQueueVisibilityTimeout || 300,
      }
    );

    // Example resource:
    const queue = new SqsQueue(this, "ExampleQueue", {
      sqsManagedSseEnabled: true,
      // TODO: Is there a CDKTF setting for enforcing encryption in transit (like cdk enforceSSL)?
      visibilityTimeoutSeconds: queueVisibilityTimeoutSecsVar.value,
    });

    // Example output (that we publish back to bootstrap CFn):
    new TerraformOutput(this, "QueueArn", {
      description: "ARN of the created example SQS queue resource",
      value: queue.arn,
    });
  }
}
