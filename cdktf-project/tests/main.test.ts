// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import { SqsQueue } from "@cdktf/provider-aws/lib/sqs-queue";
import "cdktf/lib/testing/adapters/jest";
import { Testing } from "cdktf";
// Local Dependencies:
import { CdktfProjectStack } from "../lib/stack";

describe("Example CDKTF Stack", () => {
  it("contains an SQS queue with expected properties", () => {
    const app = Testing.app();
    const stack = new CdktfProjectStack(app, "test", {});
    const template = Testing.synth(stack);

    expect(template).toHaveResource(SqsQueue);
    expect(template).toHaveResourceWithProperties(SqsQueue, {
      sqs_managed_sse_enabled: true,
      visibility_timeout_seconds: "${var.QueueVisibilityTimeout}",
    });
  });

  it("produces valid Terraform configuration", () => {
    const app = Testing.app();
    const stack = new CdktfProjectStack(app, "test");
    expect(Testing.fullSynth(stack)).toBeValidTerraform();
  });

  it("can be planned successfully", () => {
    const app = Testing.app();
    const stack = new CdktfProjectStack(app, "test");
    expect(Testing.fullSynth(stack)).toPlanSuccessfully();
  });
});
