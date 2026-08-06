# B8-11 Frozen Protocol — Greek-SLO Calibration Stopping Certificate

Frozen before inspecting the retrieved 2022–2025 TAIFEX panel.

## Working title
臺指選擇權SVI校準之Greeks風險服務水準終止證書：AI於提前停止、重啟與Fallback決策之應用

## Canonical financial mechanism
A small calibration objective or a small recent optimizer improvement does not imply that the current volatility smile is safe for production Greeks. Ill-conditioning, parameter-boundary solutions and local no-arbitrage geometry can create materially different Delta/Vega outputs at similar quote-fit errors.

## Financial estimand
At optimizer checkpoint j, estimate the conditional probability that deploying the current SVI iterate violates a pre-specified price/Greek/no-arbitrage service level relative to a fully converged deterministic multi-start oracle.

## Production decision
STOP_AND_DEPLOY / CONTINUE / MULTISTART_FALLBACK.

## Market and data
TAIFEX official TXO daily market files and TX futures daily files. Monthly TXO expiries only. Development period: 2022-01-01 through 2023-12-31. Frozen confirmation period: 2024-01-01 through 2025-12-31.

## Time integrity
Only fields contained in the same-day official file and prior-day warm start are available at the decision checkpoint. The fully converged solution and later checkpoints are labels only and are never features.

## Surface and oracle
- Infer discount factor and forward from same-expiry put-call parity using robust regression.
- Convert liquid OTM quotes to Black-76 implied volatilities.
- Fit raw SVI with bounded deterministic L-BFGS-B and a hard evaluation of butterfly density g(k).
- Oracle: best feasible result from five deterministic starts, maximum 300 optimizer iterations per start.
- Production path: prior-day warm start when available, otherwise a fixed transparent initialization; maximum 60 iterations before fallback.

## Safe-deployment label
A checkpoint is SAFE only when all conditions hold relative to the oracle on a fixed log-moneyness grid:
1. maximum absolute IV error <= 0.0075;
2. maximum absolute Delta error <= 0.005;
3. maximum relative Vega error <= 0.02, with a numerical floor fixed in code;
4. objective <= 1.05 times the oracle objective plus a fixed numerical epsilon;
5. minimum butterfly-density diagnostic g(k) >= -1e-6.

## Frozen features
Iteration count and fraction; current weighted IV RMSE; one-step and three-step objective improvement; objective relative to first checkpoint; finite-difference gradient norm; distance to parameter bounds; Jacobian condition number; minimum g(k); quote count; maturity; median relative bid-ask spread; observed skew and curvature summaries. No future or oracle-derived feature is allowed.

## AI model
HistGradientBoostingClassifier with max_depth=4, learning_rate=0.05, max_iter=200, l2_regularization=1.0, random_state=20260806. Missing values are handled natively. No hyperparameter changes after Round 1 begins.

## Decision threshold
Calibrate the probability threshold using only the expanding training window to target at least 99% precision among STOP decisions. If no threshold meets the constraint, the model must continue or fallback.

## Strongest transparent baselines
1. fixed iteration counts: 10, 20, 30, 40 and 60;
2. weighted-IV-RMSE threshold;
3. finite-difference gradient-norm threshold;
4. combined RMSE-plus-gradient threshold;
5. full deterministic production path with no early stop;
6. prior-day warm start plus the same deterministic optimizer.
All data-driven baseline thresholds are calibrated under the same 99% STOP precision constraint.

## Round 1
Expanding-month walk-forward over 2022–2023. Model and threshold are re-estimated only from prior months. All checkpoints from a surface remain in the same fold.

## Round 2
Freeze features, model hyperparameters, SLOs, baselines and failure conditions after Round 1. Fit once using all 2022–2023 data and evaluate untouched 2024–2025 data without retuning.

## Primary technical metric
Unsafe-stop rate. It must be <=1.0% in each round and may not exceed the strongest baseline.

## Primary industry metric
P95 objective-function evaluations to a production decision, including fallback evaluations. Wall-clock latency is secondary.

## Minimum economic improvement
At least 10% lower P95 function evaluations than the strongest transparent baseline in both Round 1 and Round 2, while the technical metric does not deteriorate. Combined block-bootstrap 95% confidence interval for the evaluation-saving difference must exclude zero.

## Additional robustness requirements
No-arbitrage violations may not exceed the strongest baseline. Improvement may not be driven by one quarter, one expiry-month bucket or the largest 1% of evaluation savings. Report every fixed seed and every failed surface.

## Kill conditions
KILL if any round has unsafe-stop rate above 1%; no-arbitrage violations above baseline; P95 evaluation reduction below 10%; bootstrap interval includes zero; future/oracle leakage; or the transparent combined threshold performs equivalently within 5%.

## Round 3
ROUND_3_PENDING until an append-only prospective collector has at least 120 qualified trading days across six independent months. No prospective result is claimed here.
