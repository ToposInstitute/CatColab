use std::ops::Deref;

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct FwdIdx(usize);

impl From<usize> for FwdIdx {
    fn from(value: usize) -> Self {
        Self(value)
    }
}

impl Deref for FwdIdx {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl FwdIdx {
    pub fn next(&self) -> Self {
        Self(self.0 + 1)
    }

    pub fn as_bwd(&self, scope_length: usize) -> BwdIdx {
        BwdIdx(scope_length - self.0 - 1)
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct BwdIdx(usize);

impl From<usize> for BwdIdx {
    fn from(value: usize) -> Self {
        Self(value)
    }
}

impl Deref for BwdIdx {
    type Target = usize;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl BwdIdx {
    pub fn prev(&self) -> Self {
        Self(self.0 + 1)
    }
}
