module.exports = grammar({
  name: 'category',

  rules: {
    source_file: $ => repeat($._judgment),

    _judgment: $ => choice(
      $.object_definition,
      $.arrow_definition,
    ),

    object_definition: $ => seq(
      field('name', $.identifier),
      ':',
      'Ob',
    ),

    arrow_definition: $ => seq(
      field('name', $.identifier),
      ':',
      field('dom', $.identifier),
      '->',
      field('cod', $.identifier),
    ),

    identifier: $ => /\p{Letter}[\p{Letter}\p{Number}]*/
  }
});
