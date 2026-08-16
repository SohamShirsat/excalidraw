import {
  boltIcon,
  ExportIcon,
  ExportImageIcon,
} from "@excalidraw/excalidraw/components/icons";
import { Button } from "@excalidraw/excalidraw/components/Button";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "./QuickAccessActions.scss";

export const QuickAccessActions = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const { t } = useI18n();

  return (
    <div className="quick-access-actions">
      <Button
        className="quick-access-actions__button"
        onSelect={() =>
          excalidrawAPI.updateScene({
            appState: { openDialog: { name: "imageExport" } },
          })
        }
        title={t("buttons.exportImage")}
        aria-label={t("buttons.exportImage")}
      >
        {ExportImageIcon}
      </Button>
      <Button
        className="quick-access-actions__button"
        onSelect={() =>
          excalidrawAPI.updateScene({
            appState: { openDialog: { name: "jsonExport" } },
          })
        }
        title={t("buttons.export")}
        aria-label={t("buttons.export")}
      >
        {ExportIcon}
      </Button>
      <Button
        className="quick-access-actions__button"
        onSelect={() =>
          excalidrawAPI.updateScene({
            appState: { openDialog: { name: "commandPalette" } },
          })
        }
        title={t("commandPalette.title")}
        aria-label={t("commandPalette.title")}
      >
        {boltIcon}
      </Button>
    </div>
  );
};
