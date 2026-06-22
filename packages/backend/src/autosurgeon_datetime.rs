use autosurgeon::HydrateError;
use chrono::{DateTime, TimeZone, Utc};

fn millis_to_datetime(millis: i64) -> Result<DateTime<Utc>, HydrateError> {
    Utc.timestamp_millis_opt(millis).single().ok_or_else(|| {
        HydrateError::unexpected("valid timestamp", "invalid timestamp millis".to_string())
    })
}

/// Autosurgeon serialization of `DateTime<Utc>` as milliseconds since Unix epoch.
pub mod datetime_millis {
    use autosurgeon::{HydrateError, ReadDoc, Reconcile, Reconciler};
    use chrono::{DateTime, Utc};

    /// Reconciles a `DateTime<Utc>` as milliseconds since Unix epoch.
    pub fn reconcile<R: Reconciler>(dt: &DateTime<Utc>, reconciler: R) -> Result<(), R::Error> {
        dt.timestamp_millis().reconcile(reconciler)
    }

    /// Hydrates a `DateTime<Utc>` from milliseconds since Unix epoch.
    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<DateTime<Utc>, HydrateError> {
        let millis: i64 = autosurgeon::hydrate_prop(doc, obj, prop)?;
        super::millis_to_datetime(millis)
    }
}

/// Autosurgeon serialization of `Option<DateTime<Utc>>` as optional milliseconds since Unix epoch.
pub mod option_datetime_millis {
    use autosurgeon::{HydrateError, ReadDoc, Reconcile, Reconciler};
    use chrono::{DateTime, Utc};

    /// Reconciles an `Option<DateTime<Utc>>` as optional milliseconds since Unix epoch.
    pub fn reconcile<R: Reconciler>(
        dt: &Option<DateTime<Utc>>,
        reconciler: R,
    ) -> Result<(), R::Error> {
        match dt {
            Some(dt) => super::datetime_millis::reconcile(dt, reconciler),
            None => None::<i64>.reconcile(reconciler),
        }
    }

    /// Hydrates an `Option<DateTime<Utc>>` from optional milliseconds since Unix epoch.
    pub fn hydrate<D: ReadDoc>(
        doc: &D,
        obj: &automerge::ObjId,
        prop: autosurgeon::Prop<'_>,
    ) -> Result<Option<DateTime<Utc>>, HydrateError> {
        let millis: Option<i64> = autosurgeon::hydrate_prop(doc, obj, prop)?;
        millis.map(super::millis_to_datetime).transpose()
    }
}
