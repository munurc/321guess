import { loadDataset as loadDatasetCore } from "@321guess/core";
import { apiBaseUrl } from "./api-base-url";

export function loadDataset() {
  return loadDatasetCore(apiBaseUrl());
}
