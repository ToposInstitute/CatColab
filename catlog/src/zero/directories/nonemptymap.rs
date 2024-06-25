trait FixedTypeCollection {
    type Elem;
}

trait TypeSubstitute<B> {
    type T;
}

trait Collection: FixedTypeCollection {
    fn fmap<B>(
        &self,
        f: &dyn Fn(&<Self as FixedTypeCollection>::Elem) -> <Self as TypeSubstitute<B>>::T,
    ) where
        Self: TypeSubstitute<B>;
}

pub trait NonEmptyMap<V> {}
