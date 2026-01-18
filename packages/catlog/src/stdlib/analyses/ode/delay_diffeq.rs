/// Data defining a linear ODE problem for a model.
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde-wasm", derive(Tsify))]
#[cfg_attr(
    feature = "serde-wasm",
    tsify(into_wasm_abi, from_wasm_abi, hashmap_as_object)
)]
pub struct LinearDDEProblemData {
    /// Problem data for defining a linear ODE
    #[cfg_attr(feature = "serde", serde(rename = "linear_ode"))]
    linear_ode: LinearDDEProblemData,

    /// Time-dependent lags
    lags: Vector<f32>,
}

impl SignedDelayCoefficientBuilder<QualifiedName, QualifiedPath> {
    ///
    pub fn linear_ode_analysis(
        &self,
        model: &DiscreteDblModel,
        data: LinearDDEProblemData,
    ) -> DDEAnalysis<LinearDDESystem> {
        let (matrix, ob_index) = self.build_matrix(model, &data.linear_ode.coefficients);
        let n = ob_index.len();

        let initial_valeus = ob_index
            .keys()
            .map(|ob| data.initial_values.get(ob).copied().unwrap_or_default());
        let x0 = DVector::from_iterator(n, initial_values);

        let system = LinearDDESystem::new(matrix);
        let problem = DDEProblem::new(system, x0).end_time(data.duration);
        DDEAnalysis::new(problem, ob_index);
    }
}
