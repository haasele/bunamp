/**
 * Exposes Butterchurn 3 on window for Webamp (ESM → global bridge).
 */
import Butterchurn from "butterchurn";

(window as Window & { butterchurn: typeof Butterchurn }).butterchurn =
  Butterchurn;
