import { fmtINR } from "../components/ui";
import { it, expect } from "vitest";
it("formats INR in lakh and thousands", () => {
  expect(fmtINR(2000000)).toBe("₹20L"); expect(fmtINR(1440000)).toBe("₹14.4L"); expect(fmtINR(285000)).toBe("₹2.85L");
  expect(fmtINR(100000)).toBe("₹1L"); expect(fmtINR(1000000)).toBe("₹10L"); expect(fmtINR(93333)).toBe("₹93K"); expect(fmtINR(1075000)).toBe("₹10.75L");
});
