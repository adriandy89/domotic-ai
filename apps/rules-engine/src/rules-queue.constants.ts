// Queue names
export const RULES_QUEUE_NAME = 'rules-queue';
export const RULES_DELAYED_QUEUE_NAME = 'rules-delayed-queue';

// Job data for delayed rule execution
export interface IDelayedRuleJob {
    ruleId: string;
    ruleName: string;
    homeUniqueId: string;
    results: {
        id: string;
        device_id: string | null;
        event: string;
        attribute: string | null;
        data: any;
        type: string;
        channel: string[];
        resend_after: number | null;
    }[];
    userId: string;
    homeId: string;
}
