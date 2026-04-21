import { PublicClientApplication, DeviceCodeRequest, AccountInfo, AuthenticationResult, LogLevel } from '@azure/msal-node';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = [
  'https://service.powerapps.com/.default',
  'https://management.azure.com/.default',
];

let msalClient: PublicClientApplication | null = null;
let storedAccount: AccountInfo | null = null;
let pendingDeviceCodeResult: AuthenticationResult | null = null;
let deviceCodePolling: boolean = false;

interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  message: string;
}

export function getMsalClient(): PublicClientApplication {
  if (!msalClient) {
    const tenantId = process.env.AZURE_TENANT_ID || 'common';
    const clientId = process.env.AZURE_CLIENT_ID || '';
    msalClient = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level, message) => { if (level === LogLevel.Error) console.error('[MSAL]', message); },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Warning,
        },
      },
    });
  }
  return msalClient;
}

export async function initiateDeviceCodeAuth(): Promise<DeviceCodeInfo> {
  const client = getMsalClient();
  deviceCodePolling = true;
  pendingDeviceCodeResult = null;

  let resolveDeviceCode: ((info: DeviceCodeInfo) => void) | undefined;
  let rejectDeviceCode: ((err: Error) => void) | undefined;
  const deviceCodePromise = new Promise<DeviceCodeInfo>((res, rej) => {
    resolveDeviceCode = res;
    rejectDeviceCode = rej;
  });

  const request: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      resolveDeviceCode?.({
        userCode: response.userCode,
        verificationUri: response.verificationUri,
        message: response.message,
      });
    },
  };

  // Start the auth flow in background
  client.acquireTokenByDeviceCode(request)
    .then((result) => {
      if (result) {
        pendingDeviceCodeResult = result;
        storedAccount = result.account;
      }
      deviceCodePolling = false;
    })
    .catch((err: unknown) => {
      deviceCodePolling = false;
      if (err instanceof Error) {
        rejectDeviceCode?.(err);
      }
    });

  return deviceCodePromise;
}

export async function pollForToken(): Promise<{ status: 'pending' | 'complete' | 'error'; account?: { name: string; username: string } }> {
  if (pendingDeviceCodeResult) {
    const account = pendingDeviceCodeResult.account;
    return {
      status: 'complete',
      account: account
        ? { name: account.name || account.username, username: account.username }
        : undefined,
    };
  }
  if (deviceCodePolling) {
    return { status: 'pending' };
  }
  return { status: 'error' };
}

export async function getTokenSilently(): Promise<string | null> {
  if (!storedAccount) return null;
  try {
    const client = getMsalClient();
    const result = await client.acquireTokenSilent({
      scopes: SCOPES,
      account: storedAccount,
    });
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}

export function getStoredAccount(): AccountInfo | null {
  return storedAccount;
}

export function getAccessToken(): string | null {
  return pendingDeviceCodeResult?.accessToken ?? null;
}

export async function signOut(): Promise<void> {
  storedAccount = null;
  pendingDeviceCodeResult = null;
  deviceCodePolling = false;
}
