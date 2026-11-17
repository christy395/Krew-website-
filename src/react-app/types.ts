export type User = {
  id: string;
  username: string;
  avatar: string | null;
};

export type Guild = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
};

export type Channel = {
  id: string;
  name: string;
  type: number;
};

export type Role = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed?: boolean;
};

export type WelcomeConfig = {
  enabled: boolean;
  channelId: string | null;
  welcomeMessage: string;
  welcomePing: boolean;
  welcomeImage: string | null;
  welcomeEmbed: {
    title: string;
    footer: string;
    color: string;
  };
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  leaveMessage: string;
  goodbyePing: boolean;
  leaveEmbed: {
    title: string;
    footer: string;
    color: string;
  };
  roleIds: string[];
  autoRoleDelay: number;
};

export type GuildDetail = {
  guild: Guild;
  channels: Channel[];
  roles: Role[];
  welcomeConfig: WelcomeConfig;
};

export type ApiError = { error?: string };