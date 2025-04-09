use derive_more::derive::From;
use ref_cast::RefCast;

use super::set::*;

pub trait GeneratedSet: Set {
    type Generator;
    type Generators: FinSet<Elem = Self::Generator>;

    fn generators(&self) -> &Self::Generators;
    fn generate(&self, x: &Self::Generator) -> Self::Elem;
}

pub trait GeneratedMapping: Mapping {
    type DomGenerator;

    fn apgen(&self, x: &Self::DomGenerator) -> Self::Cod;
}

#[derive(RefCast, From)]
#[repr(transparent)]
pub struct TautologicallyGenerated<S: FinSet>(S);

impl<S: FinSet> Set for TautologicallyGenerated<S> {
    type Elem = S::Elem;

    fn contains(&self, x: &Self::Elem) -> bool {
        self.0.contains(x)
    }
}

impl<S: FinSet> GeneratedSet for TautologicallyGenerated<S>
where
    S::Elem: Clone,
{
    type Generator = S::Elem;
    type Generators = S;

    fn generators(&self) -> &Self::Generators {
        &self.0
    }

    fn generate(&self, x: &Self::Generator) -> Self::Elem {
        x.clone()
    }
}
