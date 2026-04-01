/**
 * Represents the personal identification data stored locally on the device.
 */
export interface UserInfo {
  fullName: string;
  idDocument: string;
}

/**
 * Represents the prompt dismissal state for the user info registration prompt.
 *
 * When `dismissed` is true the prompt will never be shown again.
 * When `remindAfter` is set, the prompt is suppressed until that ISO date has passed.
 */
export type UserInfoPromptState =
  | { dismissed: true }
  | { remindAfter: string };
