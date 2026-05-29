// サーバー側の設定とキー判定
export const config = {
  googleKey: process.env.GOOGLE_MAPS_SERVER_KEY ?? "",
  rakutenAppId: process.env.RAKUTEN_APP_ID ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** USE_MOCK=1 で全API強制モック */
  forceMock: process.env.USE_MOCK === "1",
};

export const isMockGoogle = () => config.forceMock || !config.googleKey;
export const isMockRakuten = () => config.forceMock || !config.rakutenAppId;
export const isMockClaude = () => config.forceMock || !config.anthropicKey;
