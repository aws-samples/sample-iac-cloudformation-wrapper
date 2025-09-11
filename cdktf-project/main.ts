// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import { App } from "cdktf";
// Local Dependencies:
import { CdktfProjectStack } from "./lib/stack";

const app = new App();
new CdktfProjectStack(app, "CdktfFromCloudFormationExample", {
  /**
   * Since the stack anyway creates a Terraform Variable with name 'QueueVisibilityTimeout', and
   * we've used `TF_VAR_QueueVisibilityTimeout` as our environment variable name, it's not really
   * necessary to pass this parameter through here: Because deployment will set the Terraform
   * variable from the environment variable, and ignore the "default" value we're setting up.
   *
   * We leave it in to show that you can choose either to set sub-construct configurations
   * directly here in code, or manage them through Terraform variables where you prefer.
   */
  defaultQueueVisibilityTimeout: process.env.TF_VAR_QueueVisibilityTimeout
    ? parseInt(process.env.TF_VAR_QueueVisibilityTimeout)
    : undefined,

  // Read Terraform backend config from environment variables if present:
  s3BackendBucket: process.env.TF_BACKEND_BUCKET,
  s3BackendKey: process.env.TF_BACKEND_KEY,
});
app.synth();
