/**
 * Shared threshold constants for agent perception and UI display.
 *
 * Both the WeChat agent adapter (buildPressureLines, buildUncertaintyLines) and
 * the UI layer (MyWechatPanel.buildConversationWorldContext) use these values.
 * Keeping them in one place prevents drift between the two layers.
 */

/** Owner urgency level considered "high pressure". */
export const OWNER_URGENCY_HIGH = 68;

/** Owner patience level considered "low / communication window narrowing". */
export const OWNER_PATIENCE_LOW = 42;

/** Price gap percentage considered significant enough to warrant special handling. */
export const PRICE_GAP_SIGNIFICANT = 1.5;

/** Price gap percentage considered high enough to trigger buyer pressure warning. */
export const PRICE_GAP_HIGH = 2;

/** Customer intent level considered "decisive / ready to act". */
export const CUSTOMER_INTENT_DECISIVE = 70;

/** Customer confidence level considered "uncertain / not confirmed". */
export const CUSTOMER_CONFIDENCE_UNCERTAIN = 55;
