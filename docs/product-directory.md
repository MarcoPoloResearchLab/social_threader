# Product directory

Each public web page has one shared MPR UI footer.
The directory is available without sign-in.
The web menu uses the same configuration as NameSignal.
Its control shows `Marco Polo Research Lab LLC` beside the copyright year.
The menu shows `MPR Lab` and nine project links with short names.
`Productivity` is initially expanded.
`Web and health tools` and `Creative tools` are initially collapsed.
The footer shows `Thread splitter`, `Resources`, `Open source on GitHub`, and `Privacy` links.
`js/constants.js` contains the web menu, copyright template, and footer links.

The web directory uses the shared MPR UI `menu` contract and standard component styles.
It opens above the footer and fits without a scrollbar in its initial state.
The menu limits its height and scrolls internally when necessary.
Escape closes the menu and returns focus to its control.
An outside pointer action or a link action also closes it.
Links open in another tab and keep the current draft.
Resource grids and editor options wrap within narrow viewports.

The native client keeps the full catalog in a modal bottom sheet.
Its footer keeps `Built by MPR Lab`, `GitHub`, `Privacy`, and `Explore MPR Lab` controls.
`About MPR Lab` and `All projects` appear before the product sections.
`Writing & creativity` is initially expanded.
The other three sections are initially collapsed.
Each product link contains its name and short purpose.
Section buttons expose their expanded state to assistive technology.
The sheet handles Android Back, dismissal, and device browser errors.
Product links open through the native `Linking` adapter.
The editor remains mounted during navigation.
Text, image data, options, custom size, and copy markers remain in the current draft.
This behavior does not provide draft recovery after the operating system terminates the app.

## Source and update procedure

MPR UI owns the native catalog snapshot, validator, and imported directory stylesheet.
The web footer uses the standard MPR UI styles without the imported directory stylesheet.
`data/product-catalog-source.json` records their source paths and SHA-256 values.
The source repository records the public destination checks in `docs/product-catalog-verification.json`.
This snapshot contains 39 projects checked on 2026-09-13.

After a catalog change in MPR UI, run:

```sh
make sync-product-catalog MPR_UI_SOURCE=../mpr-ui
make test-product-catalog
make browser-test
make mobile-check
make ci
```

The import requires an explicit source directory.
It copies the catalog, validator, and stylesheet without changes.
The mobile synchronization copies the same catalog and validator into the native bundle.
The snapshot check rejects changed hashes or unequal web and mobile bytes.
Do not edit these copies in Social Threader.

`js/directory.js` initializes the web footer.
`js/ui/productDirectory.js` applies the shared menu configuration.
`ProductFooter` owns the native footer.
`ProductDirectory` owns native sheet state and link actions.

## Acceptance boundaries

Source checks use the public page and mobile app entry points.
Browser checks cover eight pages at 320, 390, 768, and 1280 pixels.
Mobile integration checks cover complete draft retention and injected browser errors.
Android emulator checks use Expo Go and the device browser.
They do not prove acceptance of an installed store artifact.

Public web acceptance requires an operator deployment and a check of the public website.
Installed mobile acceptance requires a new app artifact with this snapshot.
Older installed apps retain their previous catalog.
F003 keeps these results separate from source acceptance.
