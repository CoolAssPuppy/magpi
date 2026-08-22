import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Without this, a rendered tree survives into the next test and every
// getByTestId finds two.
afterEach(cleanup);
