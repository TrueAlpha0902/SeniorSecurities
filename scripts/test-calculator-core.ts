import assert from "node:assert/strict";
import {
  equationResidual,
  evaluateCalculatorExpression,
  solveEquationForX,
  solveLinearSystem,
} from "../src/lib/calculatorCore";

function assertApproximately(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

assert.equal(evaluateCalculatorExpression("2 + 3 × 4"), 14);
assert.equal(evaluateCalculatorExpression("-2^2"), -4);
assert.equal(evaluateCalculatorExpression("2^3^2"), 512);
assert.equal(evaluateCalculatorExpression("√144"), 12);
assert.equal(evaluateCalculatorExpression("√(144)"), 12);
assert.equal(evaluateCalculatorExpression("2√9"), 6);
assert.equal(evaluateCalculatorExpression("√.25"), 0.5);
assertApproximately(evaluateCalculatorExpression("√π"), Math.sqrt(Math.PI));

const linearRoot = solveEquationForX("2x + 3 = 11");
assertApproximately(linearRoot, 4);
assert.ok(equationResidual("2x + 3 = 11", { x: linearRoot }) < 1e-8);

const reciprocalRoot = solveEquationForX("1/x = 1");
assertApproximately(reciprocalRoot, 1);

const yieldRoot = solveEquationForX("100/(1+x)^2 = 90");
assert.ok(yieldRoot >= 0, "The finance-style equation should prefer its non-negative root");
assertApproximately(yieldRoot, Math.sqrt(100 / 90) - 1);

const repeatedRoot = solveEquationForX("(x - 3.14)^2 = 0");
assertApproximately(repeatedRoot, 3.14);

const squareRoot = solveEquationForX("x^2 = 2");
assert.ok(squareRoot >= 0, "Multiple-root equations should prefer a non-negative root");
assertApproximately(squareRoot, Math.sqrt(2));

assert.throws(() => solveEquationForX("1/(x-4) = 0"), /找不到可驗證的實數解/);
assert.throws(() => solveEquationForX("x^2 + 1 = 0"), /找不到可驗證的實數解/);

const system = solveLinearSystem("2x + y = 7", "x - y = 2");
assertApproximately(system.x, 3);
assertApproximately(system.y, 1);
assert.ok(system.maxResidual < 1e-8);

console.log("Calculator core self-test passed (expressions, x/y solving, poles, repeated roots). ");
