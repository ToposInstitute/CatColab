pub trait PossiblyId {
    fn is_id(&self) -> bool;
}

pub trait Comonoid: Sized {
    type Update: PossiblyId;

    fn id(&self) -> Self::Update;
    fn apply(&self, update: &Self::Update) -> Option<Self>;
    fn compose(&self, update1: &Self::Update, update2: &Self::Update) -> Option<Self::Update>;
}
