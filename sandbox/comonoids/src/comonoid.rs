pub trait Comonoid: Sized {
    type Update;

    fn id(&self) -> Self::Update;
    fn apply(&self, update: &Self::Update) -> Option<Self>;
    fn compose(&self, update1: &Self::Update, update2: &Self::Update) -> Option<Self::Update>;
}
