<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib uri="http://struts.apache.org/tags-html" prefix="html" %>
<%@ taglib uri="http://struts.apache.org/tags-bean" prefix="bean" %>
<%@ taglib uri="http://struts.apache.org/tags-logic" prefix="logic" %>
<bean:define id="sheet" name="sheet" type="fr.migrabench.legacy.web.DossierSheet"/>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Fiche dossier</title>
<logic:equal name="sheet" property="editable" value="true">
<%-- Piège « raccourci clavier » (TRAPS.md) : Ctrl+S enregistre, par un
     gestionnaire onkeydown écrit à la main, avec preventDefault. Pas de
     variante Cmd+S. Absent quand la fiche n'est pas modifiable. Ne pas corriger. --%>
<script type="text/javascript">
document.onkeydown = function (event) {
  event = event || window.event;
  if (event.ctrlKey && event.keyCode == 83) {
    if (event.preventDefault) {
      event.preventDefault();
    } else {
      event.returnValue = false;
    }
    document.forms["dossierForm"].submit();
    return false;
  }
};
</script>
</logic:equal>
</head>
<body>
<%-- Piège « mise en page en <table> imbriquées » (TRAPS.md) : tableaux de
     mise en page sur plusieurs niveaux, sans role="presentation". Ne pas corriger. --%>
<table width="100%" border="0" cellpadding="4" cellspacing="0">
  <tr>
    <td bgcolor="#336699"><font color="#ffffff"><h1>Fiche dossier</h1></font></td>
  </tr>
  <tr>
    <td>
      <table width="100%" border="0" cellpadding="2" cellspacing="0">
        <tr>
          <td>
            <html:errors/>
            <%-- Piège « focus initial » (TRAPS.md) : focus sur Objet par
                 l'attribut focus, que Struts transforme en JavaScript. --%>
            <html:form action="/enregistrer" method="post" focus="subject">
              <html:hidden property="number"/>
              <%-- Piège « ordre de tabulation » (TRAPS.md) : Demandeur précède
                   Objet dans le DOM, les tabindex imposent Objet → Demandeur
                   → Enregistrer. Ne pas corriger. --%>
              <table border="0" cellpadding="2" cellspacing="0">
                <tr>
                  <td>Numéro</td>
                  <td><bean:write name="sheet" property="number"/></td>
                </tr>
                <tr>
                  <td>Statut</td>
                  <td><bean:write name="sheet" property="statusLabel"/></td>
                </tr>
                <tr>
                  <td>Déposé le</td>
                  <td><bean:write name="sheet" property="filedOn"/></td>
                </tr>
                <tr>
                  <td><label for="applicant">Demandeur</label></td>
                  <td><html:text property="applicant" styleId="applicant" size="50" tabindex="2"
                                 readonly="<%= sheet.isApplicantLocked() %>"/></td>
                </tr>
                <tr>
                  <td><label for="subject">Objet</label></td>
                  <td><html:text property="subject" styleId="subject" size="80" tabindex="1"
                                 readonly="<%= sheet.isSubjectLocked() %>"/></td>
                </tr>
                <logic:equal name="sheet" property="editable" value="true">
                <tr>
                  <td>&nbsp;</td>
                  <td><html:submit value="Enregistrer" tabindex="3"/></td>
                </tr>
                </logic:equal>
              </table>
            </html:form>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
