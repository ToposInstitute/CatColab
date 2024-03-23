module.exports = grammar({
  name: 'category',

  rules: {
    source_file: $ => repeat($._judgment),

    _judgment: $ => choice(
      $.object_definition,
      $.arrow_definition,
      $.arrow_equation,
    ),

    object_definition: $ => seq(
      field('name', $.identifier),
      ':',
      'Ob',
    ),

    _object_expression: $ => $.identifier,

    arrow_definition: $ => seq(
      field('name', $.identifier),
      ':',
      field('dom', $._object_expression),
      $._arrow,
      field('cod', $._object_expression),
    ),

    _arrow_expression: $ => choice(
      $.identifier,
      $.composite_arrow
    ),

    composite_arrow: $ => seq(
      'c',
      '[',
      commaSep($._arrow_expression),
      ']'
    ),

    arrow_equation : $ => seq(
      field('lhs', $._arrow_expression),
      '=',
      field('rhs', $._arrow_expression)
    ),

    _arrow: $ => choice(
      '->',
      '→'
    ),

    identifier: $ => /\p{Letter}[\p{Letter}\p{Number}]*/
  }
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)))
}

function commaSep(rule) {
  return optional(commaSep1(rule))
}
