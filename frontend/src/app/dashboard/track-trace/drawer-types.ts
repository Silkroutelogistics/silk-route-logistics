export type DrawerTab =
  | "details" | "tracking" | "docs" | "check_calls"
  | "exceptions" | "finance" | "photos" | "activity";

export interface LoadDetailResponse {
  load: any; // Shape comes from GET /track-trace/load/:loadId
}
