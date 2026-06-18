import { describe, it, expect } from "vitest";
import {
  getRiskLevel,
  getGrade,
  getRecommendation,
} from "../../../src/services/carrierVettingService";

// The vetting decision core: a carrier's composite vetting score → risk level →
// approve/review/reject + a letter grade. These thresholds gate who can haul, so
// the boundaries must be exact (off-by-one here = wrongly auto-approving or
// auto-rejecting carriers).

describe("carrierVetting — getRiskLevel", () => {
  it("classifies by score band (>=80 LOW, >=60 MEDIUM, >=40 HIGH, else CRITICAL)", () => {
    expect(getRiskLevel(100)).toBe("LOW");
    expect(getRiskLevel(80)).toBe("LOW");
    expect(getRiskLevel(79)).toBe("MEDIUM");
    expect(getRiskLevel(60)).toBe("MEDIUM");
    expect(getRiskLevel(59)).toBe("HIGH");
    expect(getRiskLevel(40)).toBe("HIGH");
    expect(getRiskLevel(39)).toBe("CRITICAL");
    expect(getRiskLevel(0)).toBe("CRITICAL");
  });
});

describe("carrierVetting — getGrade", () => {
  it("assigns A/B/C/D/F by score band", () => {
    expect(getGrade(100)).toBe("A");
    expect(getGrade(90)).toBe("A");
    expect(getGrade(89)).toBe("B");
    expect(getGrade(75)).toBe("B");
    expect(getGrade(74)).toBe("C");
    expect(getGrade(60)).toBe("C");
    expect(getGrade(59)).toBe("D");
    expect(getGrade(40)).toBe("D");
    expect(getGrade(39)).toBe("F");
    expect(getGrade(0)).toBe("F");
  });
});

describe("carrierVetting — getRecommendation", () => {
  it("maps risk level to the gate decision", () => {
    expect(getRecommendation("LOW")).toBe("APPROVE");
    expect(getRecommendation("MEDIUM")).toBe("REVIEW");
    expect(getRecommendation("HIGH")).toBe("REVIEW");
    expect(getRecommendation("CRITICAL")).toBe("REJECT");
  });
});

describe("carrierVetting — score → decision chain", () => {
  const decide = (score: number) => getRecommendation(getRiskLevel(score));

  it("auto-approves only LOW-risk (>=80) carriers", () => {
    expect(decide(95)).toBe("APPROVE");
    expect(decide(80)).toBe("APPROVE");
    expect(decide(79)).toBe("REVIEW"); // just below the auto-approve line
  });

  it("auto-rejects only CRITICAL (<40) carriers", () => {
    expect(decide(39)).toBe("REJECT");
    expect(decide(40)).toBe("REVIEW"); // just above the auto-reject line
  });

  it("routes the broad middle (40-79) to manual REVIEW", () => {
    expect(decide(50)).toBe("REVIEW");
    expect(decide(70)).toBe("REVIEW");
  });
});
