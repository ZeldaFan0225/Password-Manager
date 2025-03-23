export interface SiteMeta {
    title?: string;
    url?: string;
    iconPath?: string | null;
    baseDomain?: string;
}

export interface DecryptedPassword {
    id?: number;
    siteMeta?: SiteMeta;
    username?: string;
    password: string;
    totpSecret?: string;
    website?: string;
    notes?: string;
}
