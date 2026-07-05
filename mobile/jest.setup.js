jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true))
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: {
    Images: "Images"
  },
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] }))
}));

global.window = global.window || {};
global.window.dispatchEvent = global.window.dispatchEvent || jest.fn();
