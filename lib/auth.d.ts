export declare const AUTH_METHODS: readonly ["native", "oauth-personal", "oauth-business", "gemini-api-key", "agent-platform", "gateway"];
export type AuthMethod = typeof AUTH_METHODS[number];
export type AgentPlatformMode = 'native' | 'adc' | 'api-key';
export interface AuthenticationConfig {
    authMethod?: AuthMethod;
    /** Only used with authMethod=agent-platform; native preserves Express precedence. */
    agentPlatformMode?: AgentPlatformMode;
    /** Absolute persistent .gemini directory; this is not its parent directory. */
    geminiHome?: string;
    gcpProject?: string;
    gcpLocation?: string;
    adcPath?: string;
    env?: Record<string, string>;
}
export declare function resolveAuthMethod(value: unknown): AuthMethod;
export declare function resolveAgentPlatformMode(value: unknown): AgentPlatformMode;
/**
 * Return overrides and undefined tombstones, never a copy of the parent env.
 * Native inheritance deliberately does not bypass DSH's credential scrub.
 * Explicit routes opt in only to their corresponding standard API key or
 * documented gateway variables. This module does not log credential values
 * or serialize them into authentication protocol metadata.
 */
export declare function authenticationEnvironment(config: AuthenticationConfig, ambient?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
