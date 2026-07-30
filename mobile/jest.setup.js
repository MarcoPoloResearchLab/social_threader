jest.mock("expo-clipboard", () => ({
  getImageAsync: jest.fn(() => Promise.resolve(null)),
  setImageAsync: jest.fn(() => Promise.resolve()),
  setStringAsync: jest.fn(() => Promise.resolve(true))
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: {
    Images: "Images"
  },
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] }))
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = global.window || {};
global.window.dispatchEvent = global.window.dispatchEvent || jest.fn();
