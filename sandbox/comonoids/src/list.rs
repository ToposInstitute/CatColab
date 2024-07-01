/**
 * TODO:
 *
 * - Write tests for compose
 * - Write "change handle" with insert, change, delete methods which builds up
 * an update imperatively
 * - Write a streaming version of compose
 * - Write an in-place version of apply
 * - Write an in-place version of compose
 * - Write a persistent version of this (i.e., on ropes or something), which can
 *   efficiently apply diffs without copying the whole list
 * - Implement conflict-reporting operational transform, using Pijul's algorithm
 * to store conflicts as non-linearly ordered lists.
 */
use crate::comonoid::*;

// All fields are sorted
#[derive(PartialEq, Eq)]
enum Segment<T: Comonoid> {
    Change(T::Update),
    Insert(T),
    Delete(usize),
    Retain(usize),
}

use Segment::*;

impl<T> Clone for Segment<T>
where
    T: Clone + Comonoid,
    T::Update: Clone,
{
    fn clone(&self) -> Self {
        match self {
            Change(u) => Change(u.clone()),
            Insert(x) => Insert(x.clone()),
            Delete(i) => Delete(*i),
            Retain(i) => Retain(*i),
        }
    }
}

pub struct Update<T: Comonoid>(Vec<Segment<T>>);

impl<T> Clone for Update<T>
where
    T: Clone + Comonoid,
    T::Update: Clone,
{
    fn clone(&self) -> Self {
        Update(self.0.clone())
    }
}

impl<T: Comonoid> Update<T> {
    fn push(&mut self, seg: Segment<T>) {
        let mut squashed = true;
        match (self.0.last_mut(), &seg) {
            (Some(Delete(i)), Delete(j)) => {
                *i += *j;
            }
            (Some(Retain(i)), Retain(j)) => {
                *i += *j;
            }
            _ => {
                squashed = false;
            }
        }
        if !squashed {
            self.0.push(seg)
        }
    }
}

impl<T> Comonoid for Vec<T>
where
    T: Comonoid + Clone,
    T::Update: Clone,
{
    type Update = Update<T>;

    fn id(&self) -> Update<T> {
        Update(vec![Retain(self.len())])
    }

    fn apply(&self, update: &Self::Update) -> Option<Self> {
        let mut next = Vec::new();
        let mut i = 0;
        for seg in update.0.iter() {
            if i >= self.len() {
                return None
            }
            match seg {
                Change(u) => {
                    next.push(self[i].apply(u)?);
                    i += 1;
                }
                Insert(x) => {
                    next.push(x.clone())
                }
                Delete(j) => {
                    i += j;
                }
                Retain(j) => {
                    if i+j > self.len() {
                        return None
                    }
                    self[i..i+j].iter().for_each(|x| next.push(x.clone()));
                    i += j;
                }
            }
        }
        Some(next)
    }

    fn compose(&self, update1: &Self::Update, update2: &Self::Update) -> Option<Self::Update> {
        let mut composed = Update(Vec::new());
        let mut i = 0;
        let mut iter2 = update2.0.iter();
        let mut leftover = Vec::new();
        for seg1 in update1.0.iter() {
            if i >= self.len() {
                return None
            }
            match seg1 {
                Change(u1) => {
                    while let Some(seg2) = leftover.pop().as_ref().or(iter2.next()) {
                        match seg2 {
                            Change(u2) => {
                                composed.push(Change(self[i].compose(u1, u2)?));
                                break;
                            }
                            Insert(x) => {
                                composed.push(Insert(x.clone()));
                            }
                            Retain(j) => {
                                composed.push(Change(u1.clone()));
                                if *j > 1 {
                                    leftover.push(Retain(*j - 1))
                                }
                                break;
                            }
                            Delete(j) => {
                                if *j > 1 {
                                    leftover.push(Delete(*j - 1))
                                }
                                break;
                            }
                        }
                    }
                    i += 1;
                }
                Insert(x) => {
                    while let Some(seg2) = leftover.pop().as_ref().or(iter2.next()) {
                        match seg2 {
                            Change(u) => {
                                composed.push(Insert(x.apply(u)?));
                                break;
                            }
                            Insert(x) => {
                                composed.push(Insert(x.clone()));
                            }
                            Retain(j) => {
                                composed.push(Insert(x.clone()));
                                if *j > 1 {
                                    leftover.push(Retain(*j - 1));
                                }
                                break;
                            }
                            Delete(j) => {
                                if *j > 1 {
                                    leftover.push(Delete(*j - 1));
                                }
                                break;
                            }
                        }
                    }
                }
                Delete(k) => {
                    composed.push(Delete(*k));
                    i += k;
                }
                Retain(k) => {
                    let mut k_rem = *k;
                    while let Some(seg2) = leftover.pop().as_ref().or(iter2.next()) {
                        if k_rem <= 0 {
                            break;
                        }
                        match seg2 {
                            Change(u) => {
                                composed.push(Change(u.clone()));
                                k_rem -= 1;
                            },
                            Insert(x) => {
                                composed.push(Insert(x.clone()));
                            },
                            Retain(j) => {
                                if *j > k_rem {
                                    composed.push(Retain(k_rem));
                                    leftover.push(Retain(*j - k_rem));
                                    break;
                                } else if *j == k_rem {
                                    composed.push(Retain(k_rem));
                                } else {
                                    composed.push(Retain(*j));
                                    k_rem -= j;
                                }
                            },
                            Delete(j) => {
                                if *j > k_rem {
                                    composed.push(Delete(k_rem));
                                    leftover.push(Delete(*j - k_rem));
                                    break;
                                } else if *j == k_rem {
                                    composed.push(Delete(k_rem));
                                } else {
                                    composed.push(Delete(*j));
                                    k_rem -= j;
                                }
                            }
                        }
                    }
                }
            }
        }
        Some(composed)
    }
}
