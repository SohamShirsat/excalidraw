import { describe, expect, it } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles, LibraryItems } from "@excalidraw/excalidraw/types";

import {
  searchWorkspace,
  type WorkspaceSearchScene,
} from "../data/WorkspaceSearch";

import type { WorkspaceMetadata } from "../data/WorkspaceData";

const workspace: WorkspaceMetadata = {
  version: 1,
  name: "Local workspace",
  folders: [
    {
      id: "folder-1",
      name: "Client Research",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  files: [
    {
      id: "file-1",
      folderId: "folder-1",
      name: "Booking Flow",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  pages: [
    {
      id: "page-1",
      fileId: "file-1",
      name: "Discovery",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "page-2",
      fileId: "file-1",
      name: "Checkout",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  activePageId: "page-1",
  createdAt: 1,
  updatedAt: 1,
};

const element = (value: Record<string, unknown>) => value as ExcalidrawElement;

const scenes = new Map<string, WorkspaceSearchScene>([
  [
    "page-1",
    {
      elements: [
        element({
          id: "text-1",
          type: "text",
          text: "Guest chooses a room",
          isDeleted: false,
          link: null,
          customData: undefined,
        }),
      ],
      files: {},
    },
  ],
  [
    "page-2",
    {
      elements: [
        element({
          id: "frame-1",
          type: "frame",
          name: "Payment confirmation",
          isDeleted: false,
          link: null,
          customData: undefined,
        }),
        element({
          id: "image-1",
          type: "image",
          fileId: "asset-1",
          isDeleted: false,
          link: null,
          customData: { fileName: "Receipt preview.png" },
        }),
      ],
      files: {
        "asset-1": {
          id: "asset-1",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,test",
          created: 1,
        },
      } as unknown as BinaryFiles,
    },
  ],
]);

const libraryItems: LibraryItems = [
  {
    id: "library-1",
    status: "unpublished",
    created: 1,
    name: "Hotel card",
    elements: [
      element({
        id: "library-text",
        type: "text",
        text: "Breakfast included",
        isDeleted: false,
        link: null,
        customData: undefined,
      }) as any,
    ],
  },
];

const search = (query: string) =>
  searchWorkspace({ workspace, scenes, libraryItems, query });

describe("workspace global search", () => {
  it("finds folders, files, and pages by hierarchy names", () => {
    expect(search("client")[0]).toMatchObject({
      kind: "folder",
      title: "Client Research",
    });
    expect(
      search("booking flow").some((result) => result.kind === "file"),
    ).toBe(true);
    expect(search("checkout").some((result) => result.kind === "page")).toBe(
      true,
    );
  });

  it("finds canvas content on every page", () => {
    expect(search("guest chooses")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          pageId: "page-1",
          elementId: "text-1",
        }),
      ]),
    );
    expect(search("payment confirmation")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "frame",
          pageId: "page-2",
          elementId: "frame-1",
        }),
      ]),
    );
  });

  it("finds assets by name and file type", () => {
    expect(search("receipt png")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "asset",
          title: "Receipt preview.png",
          pageId: "page-2",
        }),
      ]),
    );
  });

  it("finds library items by names and contained text", () => {
    expect(search("hotel card")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "library",
          libraryItemId: "library-1",
        }),
      ]),
    );
    expect(search("breakfast included")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "library",
          libraryItemId: "library-1",
        }),
      ]),
    );
  });
});
