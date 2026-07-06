jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true))
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: {
    Images: "Images"
  },
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] }))
}));

jest.mock("expo-sharing", () => ({
  shareAsync: jest.fn(() => Promise.resolve())
}));

global.window = global.window || {};
global.window.dispatchEvent = global.window.dispatchEvent || jest.fn();
