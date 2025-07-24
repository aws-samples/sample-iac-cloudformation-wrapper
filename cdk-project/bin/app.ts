#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import * as cdk from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { CdkProjectStack } from "../lib/stack";

const app = new cdk.App();
new CdkProjectStack(app, "CdkFromCloudFormationExample", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */

  // Actual solution parameters:
  queueVisibilityTimeout: process.env.EXAMPLE_VISIBILITY_TIMEOUT
    ? parseInt(process.env.EXAMPLE_VISIBILITY_TIMEOUT)
    : undefined,
});

// Optionally enable scanning the solution with CDK-Nag to enforce best-practices:
cdk.Aspects.of(app).add(new AwsSolutionsChecks());
