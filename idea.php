<?php
$msg = $_GET['name'] . ' speaking.\r\n' . $_GET['msg'];
mail('thaddee.tyl@gmail.com', 'Scout Camp', $msg);
?>
