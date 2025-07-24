// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { NagSuppressions } from "cdk-nag";

export interface ICdkProjectStackProps extends cdk.StackProps {
  /**
   * Visibility timeout for the created SQS queue in seconds
   *
   * @default 300
   */
  readonly queueVisibilityTimeout?: number;
}

/**
 * A basic example CDK stack - just creates an SQS queue
 */
export class CdkProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: ICdkProjectStackProps) {
    super(scope, id, props);

    // Example input (that we expose to the bootstrap CFn):
    const queueVisibilityTimeoutSecs = props?.queueVisibilityTimeout || 300;

    // Example resource:
    const queue = new sqs.Queue(this, "ExampleQueue", {
      enforceSSL: true,
      visibilityTimeout: cdk.Duration.seconds(queueVisibilityTimeoutSecs),
    });
    NagSuppressions.addResourceSuppressions(queue, [
      {
        id: "AwsSolutions-SQS3",
        reason:
          "Example for illustration only - no need for a dead letter queue",
      },
    ]);

    // Example output (that we publish back to bootstrap CFn):
    new cdk.CfnOutput(this, "QueueArn", {
      description: "ARN of the created example SQS queue resource",
      value: queue.queueArn,
    });
  }
}
