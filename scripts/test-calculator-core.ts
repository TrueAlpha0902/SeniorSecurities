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

const compoundFinanceRoot = solveEquationForX("(1+x)^2*(1.0613)=1.081");
assertApproximately(compoundFinanceRoot, Math.sqrt(1.081 / 1.0613) - 1);
assert.ok(equationResidual("(1+x)^2*(1.0613)=1.081", { x: compoundFinanceRoot }) < 1e-8);

const weightedEquationRoot = solveEquationForX("0.16=0.1*0.2+0.9*(1-0.35)*x");
assertApproximately(weightedEquationRoot, (0.16 - 0.1 * 0.2) / (0.9 * (1 - 0.35)));
assert.ok(equationResidual("0.16=0.1*0.2+0.9*(1-0.35)*x", { x: weightedEquationRoot }) < 1e-8);

assertApproximately(evaluateCalculatorExpression("((1)/(2))/((3)/(4))"), 2 / 3);

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

import {
  binomialProbability,
  calculateStatistics,
  complexOperate,
  matrixDeterminant,
  matrixInverse,
  matrixMultiply,
  normalCdf,
  parseIntegerForBase,
  parseMatrix,
  solveQuadraticInequality,
  solveRatio,
  vectorCross,
  vectorDot,
} from "../src/lib/calculatorAdvanced";

assertApproximately(evaluateCalculatorExpression("sin(30)", {}, { angleUnit: "deg" }), 0.5);
assertApproximately(evaluateCalculatorExpression("asin(0.5)", {}, { angleUnit: "deg" }), 30);
assert.equal(evaluateCalculatorExpression("5!"), 120);
assert.equal(evaluateCalculatorExpression("ncr(10,3)"), 120);
assert.equal(evaluateCalculatorExpression("npr(5,2)"), 20);
assertApproximately(evaluateCalculatorExpression("root(3,-8)"), -2);

assert.deepEqual(complexOperate({ re: 2, im: 3 }, { re: 1, im: -4 }, "+"), { re: 3, im: -1 });
assert.equal(parseIntegerForBase("FF", 16), 255);
const matrixA = parseMatrix("1,2;3,4");
assert.equal(matrixDeterminant(matrixA), -2);
const inverse = matrixInverse(matrixA);
assertApproximately(inverse[0]?.[0] ?? Number.NaN, -2);
assert.deepEqual(matrixMultiply(matrixA, [[1], [0]]), [[1], [3]]);
assert.equal(vectorDot([1, 2, 3], [4, 5, 6]), 32);
assert.deepEqual(vectorCross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
const stats = calculateStatistics("1,2,3,4");
assertApproximately(stats.mean, 2.5);
assertApproximately(stats.median, 2.5);
assertApproximately(normalCdf(0), 0.5, 1e-7);
assertApproximately(binomialProbability(10, 0.5, 5), 0.24609375);
assertApproximately(solveRatio(2, 3, 8), 12);
assert.equal(solveQuadraticInequality(1, -5, 6, ">="), "x ≤ 2 或 x ≥ 3");

console.log("Advanced calculator mode self-test passed (complex/base/matrix/vector/statistics/distribution/ratio/inequality). ");
