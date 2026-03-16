{ craneLibNightly }:
craneLibNightly.cargoFmt {
  src = craneLibNightly.cleanCargoSource ../..;
}
