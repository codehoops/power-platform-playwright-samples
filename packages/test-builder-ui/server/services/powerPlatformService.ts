export interface Environment {
  id: string;
  name: string;
  displayName: string;
  location: string;
}

export interface PowerApp {
  id: string;
  name: string;
  type: 'canvas' | 'model-driven';
  url: string;
}

interface BapEnvironment {
  id: string;
  name: string;
  properties: {
    displayName: string;
    azureRegion?: string;
    linkedEnvironmentMetadata?: {
      instanceUrl?: string;
    };
  };
  location: string;
}

interface CanvasApp {
  name: string;
  properties: {
    displayName: string;
    appLocation?: string;
    environment?: {
      id: string;
      name: string;
    };
    appPlayUri?: string;
  };
}

export async function listEnvironments(accessToken: string): Promise<Environment[]> {
  const url = 'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/environments?api-version=2016-11-01';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`BAP API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json() as { value: BapEnvironment[] };
  return (data.value || []).map((env) => ({
    id: env.name,
    name: env.name,
    displayName: env.properties?.displayName || env.name,
    location: env.location || '',
  }));
}

export async function listApps(accessToken: string, environmentId: string): Promise<PowerApp[]> {
  const url = `https://api.powerapps.com/providers/Microsoft.PowerApps/apps?api-version=2016-11-01&%24filter=environment+eq+'${environmentId}'&$expand=unpublishedAppDefinition`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    // Return empty on error to avoid breaking the UI
    return [];
  }
  const data = await res.json() as { value: CanvasApp[] };
  return (data.value || []).map((app) => ({
    id: app.name,
    name: app.properties?.displayName || app.name,
    type: 'canvas' as const,
    url: app.properties?.appPlayUri || '',
  }));
}
